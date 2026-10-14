import { describe, expect, it } from "vitest";
import { CANCEL_SUBSCRIPTION_REASON, cancelConfirmQuestion, cancellationState, cancelledMessage } from "./subscriptionCancel";

describe("subscriptionCancel", () => {
  it("is red once Starlink shows an end date, or once the service ended", () => {
    expect(cancellationState({ pendingCancellationDate: "2026/10/09", serviceStatus: "active" })).toEqual({ cancelled: true, endDate: "2026/10/09" });
    expect(cancellationState({ serviceStatus: "canceled" })).toEqual({ cancelled: true });
    expect(cancellationState({ serviceStatus: "active" })).toEqual({ cancelled: false });
    expect(cancellationState({ pendingCancellationDate: " " })).toEqual({ cancelled: false });
  });

  it("says the end date on the red button, and asks before cancelling", () => {
    expect(cancelledMessage({ cancelled: true, endDate: "2026/10/09" })).toBe("الاشتراك ملغى - ينتهي في 2026/10/09");
    expect(cancelledMessage({ cancelled: true })).toBe("الاشتراك ملغى");
    expect(cancelConfirmQuestion({ name: "جهاز 1" })).toContain("«جهاز 1»");
    expect(CANCEL_SUBSCRIPTION_REASON).toBe("Service is too expensive");
  });
});
