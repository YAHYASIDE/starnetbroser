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
