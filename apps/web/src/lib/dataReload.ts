import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * 🔄 «Re-read everything» without reloading the page (his Nov 7 2026 report: «صار دائمًا الزبائن لا يظهرون، وعندما يضيف
 * المسؤول 2 إضافة يتخلّط»). A full reload inside the phone app opened the HOME page's content under any other page's
 * address (the app's local server answers an unknown path with index.html) - the bar said «الزبائن», the page was the
 * home page - and the team link reloaded after every change that came in. Now the open page is remounted in place
 * (DataReloadBoundary): every screen reads its stores again, same page, same scroll.
 */

export const DATA_RELOAD_EVENT = "starnet:data-reload";

export function requestDataReload(): void {
  window.dispatchEvent(new Event(DATA_RELOAD_EVENT));
}

// ---- 🧷 what was open survives the remount (his Nov 9 2026 «التطبيق يرجع للرئيسية، وما أكتبه يضيع») ----


const kept = new Map<string, unknown>();
/** Until when a mount is a data remount (DataReloadBoundary) and takes back what was open. */
let restoreUntil = 0;

/** Called by DataReloadBoundary right before it remounts the page. */
export function markDataRemount(now = Date.now()): void {
  restoreUntil = now + 1500;
}

/** `useState` that a data remount gives back: the open conversation, the opened customer, the tab, the search… A normal
 * visit starts fresh as before. */
export function useKeptState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    Date.now() < restoreUntil && kept.has(key) ? (kept.get(key) as T) : typeof initial === "function" ? (initial as () => T)() : initial,
  );
  useEffect(() => {
    kept.set(key, value);
  }, [key, value]);
  return [value, setValue];
}
