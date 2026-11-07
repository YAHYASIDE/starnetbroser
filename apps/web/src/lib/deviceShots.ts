/**
 * 📎 «سجل لقطات الجهاز» (his Nov 7 2026 ask - «📸 لقطة ذكية» in a device's browser → «📎 احفظ في سجل الجهاز»): each
 * device's kept screenshots, by date. The pictures themselves are in the proofs store (IndexedDB, under
 * `shot:<device>:<at>` - on this phone); this index is business data (`starnet_device_shots_v1`, in the backup).
 */

export interface DeviceShot {
  /** The proofs store's key of the picture. */
  id: string;
  /** When it was taken (ms). */
  at: number;
}

export type DeviceShotStore = Record<string, DeviceShot[]>;

export function shotKey(accountId: string, at: number): string {
  return `shot:${accountId}:${at}`;
}

/** Adds one (the same twice is kept once), newest first. */
export function addDeviceShot(store: DeviceShotStore, accountId: string, at: number): DeviceShotStore {
  const id = shotKey(accountId, at);
  const list = store[accountId] ?? [];
  if (list.some((s) => s.id === id)) return store;
  return { ...store, [accountId]: [{ id, at }, ...list].sort((a, b) => b.at - a.at) };
}

export function removeDeviceShot(store: DeviceShotStore, accountId: string, id: string): DeviceShotStore {
  const list = (store[accountId] ?? []).filter((s) => s.id !== id);
  const next = { ...store };
  if (list.length) next[accountId] = list;
  else delete next[accountId];
  return next;
}

/** Every kept picture's key (so the proofs store never prunes them). */
export function allShotIds(store: DeviceShotStore): string[] {
  return Object.values(store).flatMap((list) => list.map((s) => s.id));
}

/** A picture fit to keep: a data URL of an image, not too big. */
export function isShotImage(value: unknown, maxChars = 2_000_000): value is string {
  return typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(value) && value.length <= maxChars;
}

const KEY = "starnet_device_shots_v1";
export const DEVICE_SHOTS_CHANGED = "starnet:device-shots";

export function loadDeviceShots(): DeviceShotStore {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as DeviceShotStore) : {};
  } catch {
    return {};
  }
}

export function saveDeviceShots(store: DeviceShotStore): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(DEVICE_SHOTS_CHANGED));
  } catch {
    // storage full - the banner (StorageFullBanner) says so
  }
}
