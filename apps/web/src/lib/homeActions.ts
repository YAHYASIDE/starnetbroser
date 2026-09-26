/**
 * The "المزيد" menu (BottomNav, rendered once in the layout) triggers actions that live on the
 * home screen - add a device, sync now, the clients overview - and shows the reminders count the
 * home screen computes. On "/" it talks to HomeView through window events; from any other page
 * it navigates to "/?action=..." and HomeView runs the action once on arrival.
 */

export type HomeAction = "add-account" | "sync" | "clients";

const HOME_ACTIONS: HomeAction[] = ["add-account", "sync", "clients"];

export const HOME_ACTION_EVENT = "starnet:home-action";
export const REMINDER_COUNT_EVENT = "starnet:reminder-count";

export function homeActionHref(action: HomeAction): string {
  return `/?action=${action}`;
}

/** The action carried by a "?action=..." query string, or null. */
export function parseHomeAction(search: string): HomeAction | null {
  const value = new URLSearchParams(search).get("action");
  return HOME_ACTIONS.includes(value as HomeAction) ? (value as HomeAction) : null;
}
