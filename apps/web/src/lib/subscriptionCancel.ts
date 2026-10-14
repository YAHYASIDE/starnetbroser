import type { StarlinkAccountSummary } from "@starnet/shared";

/**
 * 🛑 «إلغاء الاشتراك» on a device card: the reason Starlink is told (always the same - confirmed by
 * the operator), whether the device is already cancelled (red button) and the messages around it.
 * The cancelling itself runs in the device's Starlink browser (cancelSubscription.ts) and only ever
 * after the operator pressed the green button and confirmed.
 */
export const CANCEL_SUBSCRIPTION_REASON = "Service is too expensive";

export interface CancellationState {
  /** Cancelled on Starlink: a pending end date («scheduled to end on …»), or the service already ended. */
  cancelled: boolean;
  /** "YYYY/MM/DD" when Starlink showed it. */
  endDate?: string;
}

export function cancellationState(account: Pick<StarlinkAccountSummary, "pendingCancellationDate" | "serviceStatus">): CancellationState {
  const endDate = account.pendingCancellationDate?.trim() || undefined;
  if (endDate) return { cancelled: true, endDate };
  return { cancelled: account.serviceStatus === "canceled" };
}

/** The question asked before anything is pressed on Starlink. */
export function cancelConfirmQuestion(account: Pick<StarlinkAccountSummary, "name">): string {
  const name = account.name?.trim() || "هذا الجهاز";
  return `إلغاء اشتراك «${name}» في Starlink؟\nسيضغط التطبيق وحده: Manage ← Cancel service ← السبب ← Confirm & Cancel Service.`;
}

/** What the red button says when pressed (nothing else happens). */
export function cancelledMessage(state: CancellationState): string {
  return state.endDate ? `الاشتراك ملغى - ينتهي في ${state.endDate}` : "الاشتراك ملغى";
}
