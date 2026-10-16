/**
 * 💳 The card's red «D» → the card page's own payment form for that D (his Oct 14 2026 ask). It used
 * to open `/starlink?pay=<id>` with a full page load, and on the phone that threw him out of the app
 * (his Oct 16 2026 report «D عندما أضغطها لا تعمل، فقط يخرجني من التطبيق") - every other way to that
 * page is an in-app link. Now the D to pay rides in sessionStorage (`starnet.` - a per-tab hand-off,
 * never backed up) and the app navigates in place; `?pay=` still works if present.
 */

const KEY = "starnet.payDeepLink";

/** The D the card page should open: `?pay=` first, else the one the card handed over. Pure. */
export function payTargetFrom(search: string, stored: string | null): string | null {
  const fromUrl = new URLSearchParams(search).get("pay");
  return fromUrl || stored || null;
}

/** Called by the card's «D» right before it navigates to /starlink. */
export function rememberPayTarget(entryId: string | null): void {
  try {
    if (entryId) window.sessionStorage.setItem(KEY, entryId);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // the page still opens - only without the form already open
  }
}

/** Read once by /starlink on open (and cleared, so a later visit doesn't reopen it). */
export function takePayTarget(search: string): string | null {
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    stored = null;
  }
  return payTargetFrom(search, stored);
}
