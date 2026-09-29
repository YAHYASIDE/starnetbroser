/**
 * باقة الأولوية (e.g. the 100 GB roaming plan): when a device's priority data is used up.
 * Starlink then keeps it working at limited speed until the next cycle, so this is a warning,
 * never a "stopped" state. Exhausted = Starlink's own banner, or the synced usage reaching the
 * plan's GB amount. Pure except the small alerted-ids store (a setting - `starnet.` prefix).
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { cleanPlanName, isSisPlan } from "./status";

type PriorityInfo = Partial<Pick<StarlinkAccountSummary, "planName" | "dataUsageGb" | "priorityDataExhausted">>;

/** Share of the plan that counts as "almost used up". */
export const NEAR_LIMIT_SHARE = 0.9;

/** The plan's priority data in GB ("التجوال - 100 غيغابايت" -> 100), or undefined for an
 * unlimited / SIS / unknown plan. */
export function priorityPlanGb(planName: string | undefined): number | undefined {
  const plan = cleanPlanName(planName);
  if (!plan || isSisPlan(plan)) return undefined;
  const match = plan.match(/(\d+)\s*(غيغابايت|جيجابايت|جيجا|gb)/i);
  const gb = match ? Number(match[1]) : NaN;
  return gb > 0 ? gb : undefined;
}

export interface PriorityDataState {
  kind: "exhausted" | "near";
  usedGb?: number;
  limitGb?: number;
}

export function priorityDataState(account: PriorityInfo): PriorityDataState | null {
  const limitGb = priorityPlanGb(account.planName);
  const used = Number(account.dataUsageGb);
  const usedGb = account.dataUsageGb && Number.isFinite(used) ? used : undefined;
  if (account.priorityDataExhausted === true || (limitGb !== undefined && usedGb !== undefined && usedGb >= limitGb)) {
    return { kind: "exhausted", usedGb, limitGb };
  }
  if (limitGb !== undefined && usedGb !== undefined && usedGb >= limitGb * NEAR_LIMIT_SHARE) {
    return { kind: "near", usedGb, limitGb };
  }
  return null;
}

function isLive(a: StarlinkAccountSummary): boolean {
  return !a.archivedAt && !a.deletedAt && a.serviceStatus !== "canceled";
}

export function priorityExhaustedAccounts(accounts: StarlinkAccountSummary[]): StarlinkAccountSummary[] {
  return accounts.filter((a) => isLive(a) && priorityDataState(a)?.kind === "exhausted");
}

/** Devices to alert about now (used up and not alerted yet), and the alerted set to keep: a
 * device whose data is back (new cycle) leaves it, so running out again alerts again. */
export function priorityAlertsToSend(accounts: StarlinkAccountSummary[], alerted: string[]): { send: StarlinkAccountSummary[]; keep: string[] } {
  const out = priorityExhaustedAccounts(accounts);
  const outIds = new Set(out.map((a) => a.id));
  const send = out.filter((a) => !alerted.includes(a.id));
  return { send, keep: alerted.filter((id) => outIds.has(id)).concat(send.map((a) => a.id)) };
}

/** One card/Telegram line: "نفدت باقة الأولوية (100 جيجا) - الاستهلاك 121 GB". */
export function priorityDataLine(state: PriorityDataState): string {
  const plan = state.limitGb !== undefined ? ` (${state.limitGb} جيجا)` : "";
  const used = state.usedGb !== undefined ? ` - الاستهلاك ${state.usedGb} GB` : "";
  return state.kind === "exhausted"
    ? `نفدت باقة الأولوية${plan}${used} - الجهاز يعمل بسرعة محدودة حتى الدورة القادمة`
    : `قاربت باقة الأولوية على النفاد${plan}${used}`;
}

export function priorityTelegramText(devices: StarlinkAccountSummary[]): string {
  return [
    "⚠️ نفدت باقة الأولوية",
    "",
    ...devices.map((d) => {
      const state = priorityDataState(d);
      const plan = state?.limitGb !== undefined ? ` ${state.limitGb}G` : "";
      const used = state?.usedGb !== undefined ? ` - الاستهلاك ${state.usedGb} GB` : "";
      return `📶 ${d.name}${plan}${used}`;
    }),
    "",
    "الجهاز ما زال يعمل ولكن بسرعة محدودة حتى تجديد الدورة القادمة.",
  ].join("\n");
}

const ALERTED_KEY = "starnet.priorityAlerted";

export function loadPriorityAlerted(): string[] {
  try {
    const raw = window.localStorage.getItem(ALERTED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function savePriorityAlerted(ids: string[]): void {
  try {
    window.localStorage.setItem(ALERTED_KEY, JSON.stringify(ids));
  } catch {
    // Best effort - at worst the Telegram alert repeats once.
  }
}
