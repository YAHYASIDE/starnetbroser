/**
 * 🔔 Low-balance alerts (his Oct 10 2026 choice «إشعار الهاتف + علامة حمراء»): for any money place and
 * currency he sets a floor («نبّهني إذا نزل أورانج تحت 100,000 فرانك»). Below it the line in «حسابي»
 * turns red, and the phone is told ONCE per crossing - going back above the floor re-arms it. The
 * floor is kept in the place's currency (أورانج / نيتا: سيفا, typed in فرانك). Pure + storage.
 */

export interface BalanceAlerts {
  /** `${placeId}|${currency}` → the floor. */
  thresholds: Record<string, number>;
  /** Keys already notified while still low. */
  notified: string[];
}

export const EMPTY_BALANCE_ALERTS: BalanceAlerts = { thresholds: {}, notified: [] };

export const alertKey = (placeId: string, currency: string) => `${placeId}|${currency}`;

/** Sets (or clears, with undefined / ≤ 0) one floor. */
export function setThreshold(alerts: BalanceAlerts, key: string, value: number | undefined): BalanceAlerts {
  const thresholds = { ...alerts.thresholds };
  if (value === undefined || !Number.isFinite(value) || value <= 0) delete thresholds[key];
  else thresholds[key] = value;
  return { thresholds, notified: alerts.notified.filter((k) => k in thresholds) };
}

/** The places / currencies below their floor right now. */
export function lowKeys(alerts: BalanceAlerts, balances: Record<string, Record<string, number>>): string[] {
  return Object.entries(alerts.thresholds)
    .filter(([key, floor]) => {
      const [placeId, currency] = key.split("|") as [string, string];
      return (balances[placeId]?.[currency] ?? 0) < floor;
    })
    .map(([key]) => key);
}

/** One check: which became low since the last one (to notify), and the state to save. */
export function checkAlerts(alerts: BalanceAlerts, balances: Record<string, Record<string, number>>): { alerts: BalanceAlerts; newlyLow: string[] } {
  const low = lowKeys(alerts, balances);
  const newlyLow = low.filter((k) => !alerts.notified.includes(k));
  return { alerts: { ...alerts, notified: low }, newlyLow };
}

const KEY = "starnet_balance_alerts_v1";

export function loadBalanceAlerts(): BalanceAlerts {
  if (typeof window === "undefined") return EMPTY_BALANCE_ALERTS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<BalanceAlerts> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY_BALANCE_ALERTS;
    return { thresholds: parsed.thresholds && typeof parsed.thresholds === "object" ? parsed.thresholds : {}, notified: Array.isArray(parsed.notified) ? parsed.notified : [] };
  } catch {
    return EMPTY_BALANCE_ALERTS;
  }
}

export function saveBalanceAlerts(alerts: BalanceAlerts): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(alerts));
}
